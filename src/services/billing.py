"""
Stripe billing — Checkout for upgrades, the customer portal for
management, and a signature-verified webhook that is the single source
of truth for plan changes.

Everything degrades gracefully when STRIPE_SECRET_KEY is unset: checkout
returns a clear "not configured" error and no plan gates are enforced
(see accounts.billing_enforced).
"""

from __future__ import annotations

import os
from typing import Any

from src.services import payment_store as store
from src.services.logging import get_logger

log = get_logger("sikizana.billing")

_APP_BASE_URL = os.environ.get("APP_BASE_URL", "https://sikizana.persidian.com")

_PRICE_ENV = {
    "pro": "STRIPE_PRO_PRICE_ID",
    "business": "STRIPE_BUSINESS_PRICE_ID",
}


class BillingError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def is_configured() -> bool:
    return bool(os.environ.get("STRIPE_SECRET_KEY"))


def _stripe():
    """Lazy import so the app runs without the stripe package/key in demo."""
    if not is_configured():
        raise BillingError("Billing is not configured yet.", status_code=503)
    import stripe

    stripe.api_key = os.environ["STRIPE_SECRET_KEY"]
    return stripe


def _price_id(plan: str) -> str:
    env_var = _PRICE_ENV.get(plan)
    if not env_var:
        raise BillingError(f"Unknown plan '{plan}'.", status_code=400)
    price_id = os.environ.get(env_var, "")
    if not price_id:
        raise BillingError(f"No Stripe price configured for the {plan} plan.", status_code=503)
    return price_id


def _ensure_customer(user: dict[str, Any]) -> str:
    if user.get("stripe_customer_id"):
        return user["stripe_customer_id"]
    stripe = _stripe()
    customer = stripe.Customer.create(
        email=user["email"],
        metadata={"sikizana_user_id": str(user["id"])},
    )
    store.set_stripe_customer(user["id"], customer.id)
    return customer.id


def create_checkout(user: dict[str, Any], plan: str) -> str:
    """Create a subscription Checkout session; returns the redirect URL."""
    stripe = _stripe()
    session = stripe.checkout.Session.create(
        customer=_ensure_customer(user),
        mode="subscription",
        line_items=[{"price": _price_id(plan), "quantity": 1}],
        success_url=f"{_APP_BASE_URL}/account?checkout=success",
        cancel_url=f"{_APP_BASE_URL}/account?checkout=cancelled",
        metadata={"sikizana_user_id": str(user["id"]), "plan": plan},
        subscription_data={"metadata": {"sikizana_user_id": str(user["id"]), "plan": plan}},
    )
    log.info("checkout_created", extra={"user_id": user["id"], "plan": plan})
    return session.url


def create_portal(user: dict[str, Any]) -> str:
    """Customer portal for managing/cancelling the subscription."""
    if not user.get("stripe_customer_id"):
        raise BillingError("No billing account yet — upgrade first.", status_code=400)
    stripe = _stripe()
    session = stripe.billing_portal.Session.create(
        customer=user["stripe_customer_id"],
        return_url=f"{_APP_BASE_URL}/account",
    )
    return session.url


def handle_webhook(payload: bytes, signature: str) -> dict[str, Any]:
    """
    Verify and process a Stripe webhook. Plan changes ONLY happen here —
    never from unauthenticated client input.
    """
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not secret:
        raise BillingError("Webhook secret not configured.", status_code=503)
    stripe = _stripe()
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except Exception as exc:  # signature mismatch or bad payload
        log.warning("stripe_webhook_rejected", extra={"error": str(exc)})
        raise BillingError("Invalid webhook signature.", status_code=400)

    etype = event["type"]
    obj = event["data"]["object"]

    if etype == "checkout.session.completed":
        _apply_plan(obj.get("metadata", {}), obj.get("customer"), fallback_plan="pro")
    elif etype in ("customer.subscription.updated", "customer.subscription.created"):
        status = obj.get("status")
        if status in ("active", "trialing"):
            _apply_plan(obj.get("metadata", {}), obj.get("customer"), fallback_plan="pro")
        elif status in ("canceled", "unpaid", "incomplete_expired"):
            _downgrade(obj.get("metadata", {}), obj.get("customer"))
    elif etype == "customer.subscription.deleted":
        _downgrade(obj.get("metadata", {}), obj.get("customer"))

    log.info("stripe_webhook_processed", extra={"event_type": etype})
    return {"received": True, "type": etype}


def _find_user(metadata: dict, customer_id: str | None) -> dict[str, Any] | None:
    user_id = metadata.get("sikizana_user_id")
    if user_id:
        user = store.get_user_by_id(int(user_id))
        if user:
            return user
    if customer_id:
        return store.get_user_by_stripe_customer(customer_id)
    return None


def _apply_plan(metadata: dict, customer_id: str | None, fallback_plan: str) -> None:
    user = _find_user(metadata, customer_id)
    if not user:
        log.warning("stripe_webhook_user_not_found", extra={"customer": customer_id})
        return
    plan = metadata.get("plan") or fallback_plan
    if plan not in ("pro", "business"):
        plan = fallback_plan
    store.set_user_plan(user["id"], plan)
    log.info("plan_upgraded", extra={"user_id": user["id"], "plan": plan})


def _downgrade(metadata: dict, customer_id: str | None) -> None:
    user = _find_user(metadata, customer_id)
    if not user:
        return
    store.set_user_plan(user["id"], "free")
    log.info("plan_downgraded", extra={"user_id": user["id"]})

"""API routers for the Sikizana FastAPI app.

Each module owns one domain and exposes an APIRouter. `src/api/main.py`
creates the FastAPI app, wires middleware and lifespan, and includes
each router. Endpoints keep their original paths and behavior — this
package is a relocation boundary, not an API change.
"""

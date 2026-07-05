"""_parse_report must handle both the CLI's camelCase and the API's PascalCase."""

from src.services.xero_service import _parse_report

_CAMEL_REPORT = {
    "reportName": "ProfitAndLoss",
    "reportTitles": ["Profit & Loss", "Demo Org"],
    "rows": [
        {
            "rowType": "Section",
            "rows": [
                {"rowType": "Row", "cells": [{"value": "Sales"}, {"value": "18,450.00"}]},
                {"rowType": "SummaryRow", "cells": [{"value": "Total Income"}, {"value": "18450.00"}]},
            ],
        },
        {
            "rowType": "Section",
            "rows": [
                {"rowType": "Row", "cells": [{"value": "Rent"}, {"value": "7500.00"}]},
                {
                    "rowType": "SummaryRow",
                    "cells": [{"value": "Total Operating Expenses"}, {"value": "7500.00"}],
                },
            ],
        },
        {"rowType": "SummaryRow", "cells": [{"value": "Net Profit"}, {"value": "10950.00"}]},
    ],
}

_PASCAL_REPORT = {
    "ReportName": "ProfitAndLoss",
    "ReportTitles": ["Profit & Loss", "Demo Org"],
    "Rows": [
        {
            "RowType": "Section",
            "Rows": [
                {"RowType": "Row", "Cells": [{"Value": "Sales"}, {"Value": "18,450.00"}]},
                {"RowType": "SummaryRow", "Cells": [{"Value": "Total Income"}, {"Value": "18450.00"}]},
            ],
        },
        {
            "RowType": "Section",
            "Rows": [
                {"RowType": "Row", "Cells": [{"Value": "Rent"}, {"Value": "7500.00"}]},
                {
                    "RowType": "SummaryRow",
                    "Cells": [{"Value": "Total Operating Expenses"}, {"Value": "7500.00"}],
                },
            ],
        },
        {"RowType": "SummaryRow", "Cells": [{"Value": "Net Profit"}, {"Value": "10950.00"}]},
    ],
}


def test_parses_camelcase_cli_report():
    parsed = _parse_report(_CAMEL_REPORT)
    assert parsed["revenue"] == 18450.00
    assert parsed["expenses"] == 7500.00
    assert parsed["netProfit"] == 10950.00
    assert {"label": "Sales", "value": "18,450.00"} in parsed["lineItems"]


def test_parses_pascalcase_api_report():
    parsed = _parse_report(_PASCAL_REPORT)
    assert parsed["revenue"] == 18450.00
    assert parsed["expenses"] == 7500.00
    assert parsed["netProfit"] == 10950.00
    assert parsed["reportName"] == "ProfitAndLoss"


def test_empty_report_is_safe():
    parsed = _parse_report({})
    assert parsed["revenue"] == 0.0
    assert parsed["lineItems"] == []

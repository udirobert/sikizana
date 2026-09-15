# European Cardholder (ULB) dataset

## Acquisition

Download `creditcard.csv` from Kaggle's **Credit Card Fraud Detection** dataset:

- Source: <https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud>
- Local destination: `data/hsbc/raw/creditcard.csv`
- Expected columns: `Time`, `V1` through `V28`, `Amount`, and `Class`

Kaggle access may require an authenticated account and acceptance of the dataset terms. Do not commit the downloaded CSV or credentials.

## License and attribution

Kaggle reported the **Database Contents License (DbCL) 1.0** when this dataset was downloaded. Before a canonical run, record the dataset-page URL, access date, displayed license text, file SHA-256, and any Kaggle version identifier in that run's `provenance.json`. Publication must retain required attribution and comply with the current Kaggle dataset terms and DbCL 1.0 obligations.

## Local resource policy

The ULB CSV is small enough for this constrained development Mac (typically about 150 MB unpacked). Larger datasets or generated artifacts require a disk/RAM estimate and user approval before download or retention; see [RESOURCE_CONSTRAINTS.md](RESOURCE_CONSTRAINTS.md).

## Integrity checks

The runner rejects missing required columns, non-binary `Class` values, duplicate column names, and missing values. It records row count, class counts, prevalence, and file checksum before splitting.

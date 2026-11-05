"""European display formats, shared by build_db.py, write_summaries.py and check_summaries.py.

eur(9450.3)        -> '€9.450'        whole euros, dot as thousands separator
eur(9450.3, 2)     -> '€9.450,30'
eur_short(1234)    -> '€1,2k'         eur_short(2_345_678) -> '€2,3m'; under 1.000 -> '€950'
num(1234.5, 1)     -> '1.234,5'
date_dk('2026-12-31') -> '31.12.2026'
month_label('2026-09') -> 'Sep 2026'
"""
from datetime import date, datetime

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def num(x, decimals=0):
    s = f"{abs(x):,.{decimals}f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return ("-" if x < 0 and float(s.replace(".", "").replace(",", ".")) != 0 else "") + s


def eur(x, decimals=0):
    return f"€{num(x, decimals)}"


def eur_short(x):
    a = abs(x)
    if a >= 1e6:
        return f"€{num(x / 1e6, 1)}m"
    if a >= 1e3:
        return f"€{num(x / 1e3, 1)}k"
    return eur(x)


def pct(x, decimals=1):
    return f"{num(x, decimals)} %"


def date_dk(d):
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    if isinstance(d, datetime):
        d = d.date()
    return d.strftime("%d.%m.%Y")


def month_label(period):
    return f"{MONTHS[int(period[5:7]) - 1]} {period[:4]}"


if __name__ == "__main__":
    assert eur(9450.3) == "€9.450"
    assert eur(9450.3, 2) == "€9.450,30"
    assert eur_short(1234) == "€1,2k" and eur_short(2_345_678) == "€2,3m" and eur_short(950) == "€950"
    assert num(1234.5, 1) == "1.234,5" and pct(92.34) == "92,3 %"
    assert date_dk("2026-12-31") == "31.12.2026" and month_label("2026-09") == "Sep 2026"
    print("fmt.py: all format checks pass")

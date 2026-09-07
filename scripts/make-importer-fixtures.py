"""
Fixture workbooks for the importer test suite (scripts/test-importer-groups.mjs).
Writes into ~/fixtures. Run from the repo root:  python3 scripts/make-importer-fixtures.py

Everything is generated here, legacy files included, so the suite is
self-contained and a fresh machine can reproduce it.

Goals-tab layout as of 2026-09-07 (template v3):
    A name · B email · C weekly goal · D group · E long run
GROUP does not move; long run appends on the right. The v2 file is the same
minus column E; the v1 file has neither GROUP nor a mid-distance plan column.
Both must still import — that is what the importer's header lookup is for, and
cases 10 and 11 are the tests that prove it.
"""
import openpyxl, datetime as dt, os
from openpyxl import Workbook

SRC = "docs/templates/hooslog_week_plan_template.xlsx"
OUT = os.path.expanduser("~/fixtures"); os.makedirs(OUT, exist_ok=True)

C_GOAL, C_GROUP, C_LONG = 3, 4, 5

def load():
    return openpyxl.load_workbook(SRC)

def fill(wb, monday=dt.datetime(2026,9,7), dist=None, mid=None, rows=None):
    """rows: (row, weekly, long_run, group) — any of the three may be None."""
    ws = wb["Week Plan"]; ws["B3"] = monday
    for i in range(7):
        ws.cell(row=6+i, column=3, value=(dist or [None]*7)[i])
        ws.cell(row=6+i, column=4, value=(mid or [None]*7)[i])
    gs = wb["Goals"]
    for r in range(2, 32):                      # clear the pre-filled roster
        for c in (C_GOAL, C_LONG, C_GROUP):
            gs.cell(row=r, column=c, value=None)
    for r, goal, long_run, grp in (rows or []):
        gs.cell(row=r, column=C_GOAL,  value=goal)
        gs.cell(row=r, column=C_GROUP, value=grp)
        gs.cell(row=r, column=C_LONG,  value=long_run)
    return wb

D = ["TR + drills","6x1mi @ threshold","TR 8-10mi","TR + strides","Fartlek","LR 14-16mi","Off"]
M = ["TR + drills","8x400 @ 3k","TR 6-8mi","TR + strides","6x200","LR 10-12mi","Off"]

# ---- current template ----------------------------------------------------
# 1 both schedules + groups + long runs
fill(load(), dist=D, mid=M, rows=[
    (2, 62, 14, "Distance"), (3, 45, "10-12", "Mid-D"),
    (4, "55-60", "16+", "Mid-D"), (5, "60+", None, None),
]).save(f"{OUT}/01_normal.xlsx")
# 2 bad group word — GROUP now lives in E
fill(load(), dist=D, mid=M, rows=[(2, 62, None, "Middle-ish")]).save(f"{OUT}/02_bad_group.xlsx")
# 3 mid athletes, empty mid column
fill(load(), dist=D, mid=None, rows=[(2,62,None,"Distance"),(3,45,None,"Mid-D")]).save(f"{OUT}/03_mid_no_plan.xlsx")
# 4 mid plan, nobody mid
fill(load(), dist=D, mid=M, rows=[(2,62,None,"Distance")]).save(f"{OUT}/04_plan_no_mid.xlsx")
# 5 group but no mileage at all
fill(load(), dist=D, mid=M, rows=[(2,None,None,"Mid-D")]).save(f"{OUT}/05_group_no_goal.xlsx")
# 6 distance column empty
fill(load(), dist=None, mid=M, rows=[(2,62,None,"Mid-D")]).save(f"{OUT}/06_no_distance.xlsx")
# 7 group spelling variants
fill(load(), dist=D, mid=M, rows=[(2,60,None,"md"),(3,60,None,"MID DISTANCE"),(4,60,None,"d"),(5,60,None,"  Mid-D ")]).save(f"{OUT}/07_variants.xlsx")
# 8 not a monday
fill(load(), monday=dt.datetime(2026,9,8), dist=D, mid=M, rows=[(2,62,None,"Distance")]).save(f"{OUT}/08_not_monday.xlsx")
# 9 the shipped template, untouched
load().save(f"{OUT}/09_blank_template.xlsx")

# ---- long run cases ------------------------------------------------------
# 12 the three formats a coach writes
fill(load(), dist=D, mid=M, rows=[(2,62,14,None),(3,62,"14-16",None),(4,62,"16+",None)]).save(f"{OUT}/12_long_run.xlsx")
# 13 words in the long run cell
fill(load(), dist=D, mid=M, rows=[(2,62,"as far as he feels",None)]).save(f"{OUT}/13_long_run_words.xlsx")
# 14 the weekly number typed into the long run cell
fill(load(), dist=D, mid=M, rows=[(2,62,65,None)]).save(f"{OUT}/14_long_run_too_big.xlsx")
# 15 long run only, no weekly
fill(load(), dist=D, mid=M, rows=[(2,None,15,None)]).save(f"{OUT}/15_long_run_only.xlsx")
# 16 long run longer than the week — the columns are swapped
fill(load(), dist=D, mid=M, rows=[(2,18,22,None)]).save(f"{OUT}/16_long_over_week.xlsx")

# ---- legacy files: coaches who never downloaded the new one --------------
HDR_V1 = ["ATHLETE NAME", "UVA EMAIL", "WEEKLY GOAL (MILES)"]
HDR_V2 = HDR_V1 + ["GROUP"]

def legacy(headers, mid_col, path, rows):
    """A workbook shaped like an older template: v1 has one plan column and no
    GROUP; v2 has both plan columns and GROUP in D."""
    wb = Workbook()
    ws = wb.active; ws.title = "Week Plan"
    ws["A3"] = "Week of (Monday):"; ws["B3"] = dt.datetime(2026, 9, 7)
    ws["A5"], ws["B5"], ws["C5"] = "DAY", "DATE", "WORKOUT PLAN"
    if mid_col:
        ws["D5"] = "MID-DISTANCE PLAN"
    for i in range(7):
        ws.cell(row=6+i, column=1, value=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i])
        ws.cell(row=6+i, column=3, value=D[i])
        if mid_col:
            ws.cell(row=6+i, column=4, value=M[i])
    gs = wb.create_sheet("Goals")
    for i, h in enumerate(headers):
        gs.cell(row=1, column=1+i, value=h)
    for r, values in enumerate(rows, start=2):
        for i, v in enumerate(values):
            gs.cell(row=r, column=1+i, value=v)
    wb.save(path)

legacy(HDR_V1, False, f"{OUT}/10_legacy_v1_filled.xlsx", [
    ["Cayden Wayne Dyer", "kma8am@virginia.edu", 62],
    ["Jimmy Wischusen", "kna3ed@virginia.edu", "55-60"],
])
legacy(HDR_V2, True, f"{OUT}/11_legacy_v2_filled.xlsx", [
    ["Cayden Wayne Dyer", "kma8am@virginia.edu", 62, "Distance"],
    ["Jimmy Wischusen", "kna3ed@virginia.edu", "55-60", "Mid-D"],
])

# ---- headers relabelled by hand, the way a coach would ------------------
# 17: exactly what Dunbar is likely to type after the meeting. The GROUP column
# gets named for what it holds, and the long run column gets "DISTANCE" tacked
# on. Both must still be found.
wb = load()
gs = wb["Goals"]
gs.cell(row=1, column=C_GROUP, value="MID-D OR DISTANCE")
gs.cell(row=1, column=C_LONG,  value="LONG RUN DISTANCE")
fill(wb, dist=D, mid=M, rows=[(2, 62, 14, "Distance"), (3, 45, "10-12", "Mid-D")]).save(f"{OUT}/17_relabelled_headers.xlsx")

# 18: the group column renamed to something the parser cannot recognise. The
# upload must still post, and must SAY that nobody's group will change.
wb = load()
wb["Goals"].cell(row=1, column=C_GROUP, value="TRAINING TYPE")
fill(wb, dist=D, mid=M, rows=[(2, 62, 14, None)]).save(f"{OUT}/18_no_group_header.xlsx")

print("fixtures written to", OUT)

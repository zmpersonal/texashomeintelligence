"""Unit tests for the content-quality gates. Run: python3 -m pytest tests/ (or python3 tests/test_validator.py)
Covers the failure modes that would most damage the brand (VALIDATOR.md 'Testing')."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import validator as v

STORY = {"metric":"drought_stage","figure":"+2 stages (now Stage 3)",
         "source":"US Drought Monitor","as_of":"2026-05-13","value":3}

def _good():
    return {"platform":"facebook","angle":"warning",
            "caption":"Travis County: drought jumped +2 stages (now Stage 3) — source: US Drought Monitor, as of 2026-05-13. Roofs 15+ years, get looked at. Send to a neighbor. https://x",
            "on_screen_text":["+2 stages (now Stage 3)","US Drought Monitor · 2026-05-13"],
            "media_url":"x","has_source_card":True,"destination_url":"https://x","destination_theme":"drought_stage"}

def test_good_passes():
    assert v.validate_post(_good(), STORY, {}).ok

def test_fabricated_numeral_rejected():          # G1
    p=_good(); p["caption"]=p["caption"].replace("+2 stages","+9 stages")
    r=v.validate_post(p,STORY,{}); assert not r.ok and any("G1" in f for f in r.failures)

def test_missing_source_card_rejected():         # G3 (survives-splice)
    p=_good(); p["has_source_card"]=False
    r=v.validate_post(p,STORY,{}); assert not r.ok and any("G3" in f for f in r.failures)

def test_steering_rejected():                    # G8 (Fair Housing)
    p=_good(); p["caption"]="Best zips to live in Travis this month → https://x"
    r=v.validate_post(p,STORY,{}); assert not r.ok and any("G8" in f for f in r.failures)

def test_alarm_rejected():                       # G7
    p=_good(); p["caption"]="SHOCKING disaster in Travis!! "+p["caption"]
    r=v.validate_post(p,STORY,{}); assert not r.ok and any("G7" in f for f in r.failures)

def test_gated_angle_without_story():            # G6b (quiet-week / no backing story)
    p=_good()
    r=v.validate_post(p,None,{}); assert not r.ok and any("G6b" in f for f in r.failures)

def test_gated_metric_availability():            # G6
    cfg={"gated_metrics":{"appraisal_change":{"available":False}}}
    assert v.angle_data_available("appraisal_change",cfg) is False
    assert v.angle_data_available("drought_stage",cfg) is True

if __name__=="__main__":
    fns=[f for n,f in sorted(globals().items()) if n.startswith("test_")]
    ok=0
    for f in fns:
        try: f(); ok+=1; print("PASS",f.__name__)
        except AssertionError: print("FAIL",f.__name__)
    print(f"{ok}/{len(fns)} passed")

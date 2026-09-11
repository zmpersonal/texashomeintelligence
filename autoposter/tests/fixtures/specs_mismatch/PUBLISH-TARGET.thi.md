# PUBLISH-TARGET.thi.md — DELIBERATELY WRONG FIXTURE

A target file that self-identifies as a DIFFERENT site than the THI editorial spec names. The
engine must HALT on this rather than publish THI's article to someone else's domain. This is the
mismatch case the two-lock design exists for.

## Self-identification guard
```
site_domain: austinhomeintelligence.com
site_name:   Austin Home Intelligence
```

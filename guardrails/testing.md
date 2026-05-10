# Test Commands

## After Step 13 (spec-agent)

```bash
node test/run-spec-agent.js \
  --tenant local \
  --project my-product \
  --workspace ./workspaces/local/my-product \
  --story "As a user I want to log in with email and password"
```

Expected:
- Refined spec + acceptance criteria printed to console
- Files at `./workspaces/local/my-product/output/versions/v1/specs/`
- `manifest.json` present with correct metadata
- Quality score printed, must be >= 80 to pass gate
- Cost printed to console

## After Step 25 (full pipeline + UI)

```bash
node test/run-full-pipeline.js --tenant local --project {your-product}
```

Verify:
- Cost tracked per call
- History compressed after 20 turns
- Vault size warnings shown
- Selective context injection confirmed in logs

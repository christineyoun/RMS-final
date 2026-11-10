RMS soybean-oil STEP 5 recovery (November 2, 2026 checkpoint)

1) Extract RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs from this ZIP.
2) Copy the .mjs file into /Users/christineyoun/Downloads/RMS_final_main/
   (same folder as package.json).
3) In VS Code's terminal, with RMS_final_main as the working directory, run:

   node RMS_SOYBEAN_OIL_STEP5_RECOVERY.mjs --check-only

This check-only mode was tested against the user-provided November 2 source archive.
It performs no Gemini call and does not write files.

DO NOT execute any --retry-once / --approve-paid command until we have reviewed
its prerequisites and the check-only results together.
The existing paid-step5search.json marker must not be deleted or renamed.

This ZIP only provides the recovery script; it is NOT a full RMS replacement.

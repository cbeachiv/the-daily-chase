# Writing home: Chase's personal writing

This folder is a Compound Writing home (the `compound-writing` plugin from Every, enabled in `.claude/settings.json`). It covers Chase's own bylined and personal writing: the Mariemont Town Crier, civic letters, and personal emails. Hugga newsletter writing lives in the hugga-retreats-website repo, not here.

- `VOICE.md`: how Chase's sentences sound (syntax, diction, tone).
- `STYLE.md`: what a piece must do, contain, and prove (structure, evidence, readiness).
- `examples/`: real writing by Chase that backs up the rules. Evidence, not text to copy.
- `drafts/<piece-slug>/`: one folder per piece with notes, research, outline, versions, and reviews.

## Authorship rule: Chase writes, Claude assists

For anything published under Chase's name, Chase writes at least 75% of the final words and Claude writes no more than 25%.

- Chase drafts first, always. Dictated drafts count as his.
- Do not run `cw-draft` to produce prose for a bylined piece, and do not write a section Chase has not attempted.
- Allowed freely: `cw-interview`, `cw-outline`, `cw-bluf`, `cw-dev-edit`, `cw-reader`, `cw-mom`, `cw-voice-check`, `cw-ai-check`, `cw-tracks`, `cw-final-pass`, and the reviewer lenses. These give feedback; they do not write the piece.
- `cw-line-edit`, `cw-hook`, `cw-transition`: return suggestions Chase accepts or rejects one by one, never a silent rewrite.
- Claude's share is the factual backbone (names, dates, records, checked against sources), transitions Chase asks for, the headline and photo captions, and trimming to length.
- Interview prep, transcription, and quote banks do not count toward the 25%.
- Keep each version Chase writes as its own file (`draft-version-one.md`, `draft-version-two.md`, ...) so the split can be measured at the end.

## Saving lessons

When Chase confirms a preference during editing, save it with `cw-save`: sentence-level lessons to `VOICE.md`, structure and substance lessons to `STYLE.md`. Only save what Chase confirms, not one-off choices.

# Notice

This skill adapts the method and attack-class taxonomy of Cloudflare's `security-audit` skill
(https://github.com/cloudflare/security-audit-skill, commit c1c8a8c), condensed and rewritten
for a single read-only auditor in the factory. Its licence:

```
MIT License

Copyright (c) 2025-2026 Cloudflare, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The vulnerability classes in `WEB-API-AND-AUTH.md` (API section) and the checks for file upload,
race conditions and request handling were also informed by two public pentest skill collections,
`frendysanusi/claude-pentest-skills` and `penligent/AIPentest_Skills`. Those repositories publish no
licence, so no text from them is reproduced here; only general vulnerability-class ideas, written in
our own words, were used. Their live-testing, payload and exploit material is deliberately left out:
the factory reviews source code and never attacks running systems.

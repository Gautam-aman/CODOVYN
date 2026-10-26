# Platform scope

Target: macOS ARM64 / Apple Silicon only. Local qualification machine: Apple M2, 8 GiB RAM, macOS 27.0.1 (26A434), Node 26.12.1, Xcode Command Line Tools, Git; JDK 21.0.7 compiling a Java 17 fixture, Maven 3.9.11 with pinned cached dependencies.

The original editor executable declares macOS 12.0 while bundled Node declares 13.5. Assembly now reads the runtime Mach-O minimum and uses the higher requirement in Info.plist. That fixes an inconsistent installation claim; it does not prove macOS 13.5–26 compatibility. Hosted macOS 15 qualification is prepared but blocked before execution. A verified supported OS range and second clean Mac are release gates.

Node is bundled for end users; Java, Maven and provider CLIs are separate installations. No full Java language-server/debugger support is claimed from a syntax/editor smoke. Install compatible language tooling through Open VSX and test it separately.

Intel macOS, Windows and Linux installers are not implemented/validated. Portable unit checks on those OSes do not establish native IDE support.

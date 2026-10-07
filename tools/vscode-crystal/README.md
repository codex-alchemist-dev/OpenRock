# Crystal for VS Code

Syntax highlighting for the line-based Crystal languages: `.cinema` (Crystal Cinema) and `.fmbe` (Crystal FMBE). The grammar is
generated from the compiler's own verb registry (`node tools/genCrystalGrammar.js`), so it highlights exactly the keywords that
compile. Crystal Refs (`@:name`, `@minecraft:zombie`) get their own colour.

Install for development: open this folder in VS Code and press F5, or copy it into `~/.vscode/extensions/crystal-language`.

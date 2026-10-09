import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
for (const file of ['index.html', 'admin-support.html']) {
    const html = fs.readFileSync(file, 'utf8');
    let i = 0;
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/application\/ld\+json/.test(match[1])) {
            JSON.parse(match[2]);
            continue;
        }
        const code = match[2].replace(/^\s*import .*?;\s*$/mg, '');
        new vm.Script(code, { filename: `${file}:script-${++i}` });
    }
}
for (const file of fs.readdirSync('assets/js').filter(f => f.endsWith('.js')))
    new vm.Script(fs.readFileSync('assets/js/' + file, 'utf8'), { filename: file });
for (const file of ['supabase/functions/submit-feedback/index.ts', 'supabase/functions/track-acquisition/index.ts', 'supabase/functions/_shared/measurement.ts']) {
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true, fileName: file });
    const errors = output.diagnostics.filter(x => x.category === ts.DiagnosticCategory.Error);
    if (errors.length)
        throw Error(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: x => x, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' }));
}
console.log('All inline, external JS, and changed Edge TS parse successfully.');

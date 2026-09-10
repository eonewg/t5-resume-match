// Reproducible browser acceptance: isolated FastAPI + SQLite, offline Resume, explicit Mock Diagnosis.
// This verifies transport/rendering/integration, never external model quality.
const {spawn} = require('node:child_process');
const {createServer} = require('node:net');
const {once} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const desktop = process.argv.includes('--desktop');
const out = path.join(root, desktop ? '.verification/desktop-workspace' : '.verification/react-product-shell');
fs.mkdirSync(out, {recursive:true});
async function run(file, env) {
  const child = spawn(process.execPath, [path.join(__dirname, file)], {cwd:root, env, stdio:'inherit', windowsHide:true});
  const [code] = await once(child, 'exit');
  if (code !== 0) throw Error(`${file} failed (${code})`);
}
(async()=>{
  const portProbe = createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
  const port = portProbe.address().port; await new Promise(resolve => portProbe.close(resolve));
  const logfile = fs.openSync(path.join(out, 'server.log'), 'w');
  // Use the locked project interpreter. No inherited provider/database settings reach Settings.
  const server = spawn(path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'), ['-m','scripts.frontend_test_server','--port',String(port)], {cwd:root, stdio:['ignore',logfile,logfile], windowsHide:true});
  const base = `http://127.0.0.1:${port}`;
  try {
    let ready = false;
    for (let i=0;i<100;i++) {
      if (server.exitCode !== null) throw Error('Isolated server exited; inspect server.log');
      try {if ((await fetch(base+'/health')).ok) {ready=true;break;}} catch {}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if (!ready) throw Error('Isolated server startup timed out');
    const imported = await fetch(base+'/api/v1/analytics/sample-jobs', {method:'POST'});
    if (!imported.ok) throw Error('Test market snapshot import failed');
    const env={...process.env,T5_DESKTOP:desktop?'1':'0',T5_DESKTOP_OUT:path.join(out,'desktop'),T5_SMOKE_URL:base,T5_SMOKE_OUT:path.join(out,'flow'),T5_POLISH_OUT:path.join(out,'boundaries'),T5_RESUME_RECOVERY_OUT:path.join(out,'recovery'),T5_SHELL_OUT:path.join(out,'shell')};
    const suites = {'diagnosis-layout':'diagnosis-layout-smoke.cjs', assessment:'matching-assessment-smoke.cjs', flow:'task-flow-smoke.cjs', boundaries:'polish-smoke.cjs', recovery:'resume-ai-recovery-smoke.cjs', shell:'shell-boundaries-smoke.cjs', ...(desktop ? {desktop:'desktop-workspace-smoke.cjs', studio:'studio-smoke.cjs'} : {})};
    const requested = process.argv.slice(2).filter(arg=>arg !== '--desktop');
    if (requested.some(key=>!suites[key])) throw Error('Unknown suite; use diagnosis-layout, assessment, flow, boundaries, recovery, shell, or --desktop desktop/studio');
    for (const file of requested.length ? requested.map(key=>suites[key]) : Object.values(suites)) await run(file,env);
    console.log('PASS: React workflow, boundaries and recovery at requested viewport sizes. Offline AI; no model-quality claim.');
  } finally {server.kill(); if (server.exitCode === null) await once(server,'exit'); fs.closeSync(logfile);}
})().catch(error=>{console.error(error);process.exitCode=1;});

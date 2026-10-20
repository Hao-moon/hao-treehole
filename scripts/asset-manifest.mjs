import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=[];
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await walk(p);else{const bytes=await readFile(p);files.push({path:path.relative(root,p).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),license:'MIT',source:'ASSETS.md'});}}}
await walk(path.join(root,'site/assets'));files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(path.join(root,'assets-manifest.json'),JSON.stringify({edition:'original-demo',assets:files},null,2)+'\n');
console.log(`${files.length} original assets, ${(files.reduce((n,f)=>n+f.bytes,0)/1048576).toFixed(2)} MiB`);

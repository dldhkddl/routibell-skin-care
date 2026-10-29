import { readFileSync, writeFileSync } from 'node:fs';
import { APP } from '../앱설정.js';

const writeChanged=(path,content)=>{const address=new URL('../'+path,import.meta.url);if(readFileSync(address,'utf8')!==content)writeFileSync(address,content);};
const config=JSON.parse(readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
writeChanged('capacitor.config.json',JSON.stringify({...config,appName:APP.name},null,2)+'\n');
const escape=value=>value.replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));
const strings=readFileSync(new URL('../android/app/src/main/res/values/strings.xml',import.meta.url),'utf8');
writeChanged('android/app/src/main/res/values/strings.xml',strings.replace(/(<string name="(?:app_name|title_activity_main)">)[^<]*(<\/string>)/g,(_,prefix,suffix)=>prefix+escape(APP.name)+suffix));

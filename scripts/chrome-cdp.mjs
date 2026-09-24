import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function chromePath() {
  for (const name of ["google-chrome-stable","google-chrome","chromium","chromium-browser"]) {
    try {
      const found = execFileSync("which",[name],{encoding:"utf8"}).trim();
      if (found) return found;
    } catch {}
  }
  throw new Error("Chrome/Chromium não encontrado para Visual QA.");
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

class Cdp {
  constructor(url) {
    this.url=url;
    this.id=0;
    this.pending=new Map();
  }
  async open() {
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{
      this.ws.addEventListener("open",resolve,{once:true});
      this.ws.addEventListener("error",reject,{once:true});
    });
    this.ws.addEventListener("message",(event)=>{
      const data=JSON.parse(String(event.data));
      if (!data.id) return;
      const pending=this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(data.error.message || "CDP error"));
      else pending.resolve(data.result || {});
    });
  }
  send(method,params={}) {
    const id=++this.id;
    return new Promise((resolve,reject)=>{
      this.pending.set(id,{resolve,reject});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async evaluate(expression) {
    const result=await this.send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    return result.result?.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

export async function withChrome(callback) {
  const port=9222 + Math.floor(Math.random()*300);
  const profile=await mkdtemp(path.join(os.tmpdir(),"seedf-chrome-"));
  const child=spawn(chromePath(),[
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--hide-scrollbars",
    "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port="+port,
    "--user-data-dir="+profile,
    "about:blank",
  ],{stdio:"ignore"});
  const endpoint="http://127.0.0.1:"+port;
  let ready=false;
  for (let attempt=0;attempt<60;attempt+=1) {
    try {
      const response=await fetch(endpoint+"/json/version");
      if (response.ok) { ready=true; break; }
    } catch {}
    await sleep(100);
  }
  if (!ready) {
    child.kill("SIGKILL");
    await rm(profile,{recursive:true,force:true});
    throw new Error("Chrome DevTools não iniciou.");
  }
  async function page(width,height) {
    const response=await fetch(endpoint+"/json/new?about:blank",{method:"PUT"});
    if (!response.ok) throw new Error("Não foi possível criar página CDP.");
    const target=await response.json();
    const cdp=new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<=520});
    return {
      cdp,
      target,
      async navigate(url) {
        await cdp.send("Page.navigate",{url});
        for (let attempt=0;attempt<80;attempt+=1) {
          const state=await cdp.evaluate("document.readyState");
          if (state==="complete") break;
          await sleep(50);
        }
        await sleep(500);
      },
      async close() {
        cdp.close();
        try { await fetch(endpoint+"/json/close/"+target.id,{method:"PUT"}); } catch {}
      },
    };
  }
  try { return await callback({page}); }
  finally {
    child.kill("SIGTERM");
    await sleep(100);
    if (!child.killed) child.kill("SIGKILL");
    await rm(profile,{recursive:true,force:true});
  }
}

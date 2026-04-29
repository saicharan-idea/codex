import { RpcError } from './errors.js';
import { ToolRegistry } from './toolRegistry.js';
export async function dispatch(reg:ToolRegistry,name:string,args:any,ctx:any){const t=reg.get(name); if(!t) throw new RpcError('TOOL_NOT_FOUND','Invalid tool'); return t.handler(args,ctx);}

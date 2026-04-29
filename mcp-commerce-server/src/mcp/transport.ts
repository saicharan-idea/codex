import { RpcError } from './errors.js';
export const ok=(id:any,result:any)=>({jsonrpc:'2.0',id,result});
export const err=(id:any,e:any)=>({jsonrpc:'2.0',id,error:{code:e.code||'INTERNAL_ERROR',message:e.message,details:e.details}});
export function parse(body:any){if(body?.jsonrpc!=='2.0') throw new RpcError('INVALID_REQUEST','jsonrpc must be 2.0'); return body;}

export type Domain='food'|'grocery';
export type JsonRpcReq={jsonrpc:'2.0';id:string|number;method:'tools/list'|'tools/call'|'tools/meta';params?:any};
export type JsonRpcRes={jsonrpc:'2.0';id:string|number|null;result?:any;error?:{code:string;message:string;details?:any}};
export type ToolDef={name:string;description:string;domain:Domain;inputSchema:any;outputSchema:any;isMutating:boolean;requiresAuth:boolean;requiresConfirmation:boolean;handler:(args:any,ctx:any)=>Promise<any>|any};

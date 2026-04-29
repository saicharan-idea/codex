import { config } from '../config.js';
export const validateBearer=(auth?:string)=>{if(!auth?.startsWith('Bearer ')) return false; const token=auth.slice(7); return token===config.devToken;};

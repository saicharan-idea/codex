import pino from 'pino';
export const maskPII=(v:string)=>v.replace(/.(?=.{4})/g,'*');
export const logger=pino({level:'info'});

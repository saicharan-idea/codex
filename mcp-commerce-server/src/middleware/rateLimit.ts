import { Request, Response, NextFunction } from 'express'; import { config } from '../config.js';
const buckets=new Map<string,{count:number;start:number}>();
export function rateLimit(req:Request,res:Response,next:NextFunction){const k=req.ip||'x';const n=Date.now();const b=buckets.get(k)||{count:0,start:n}; if(n-b.start>config.rateWindowMs){b.count=0;b.start=n;} b.count++; buckets.set(k,b); if(b.count>config.rateLimitMax) return res.status(429).json({error:'Rate limit exceeded'}); next();}

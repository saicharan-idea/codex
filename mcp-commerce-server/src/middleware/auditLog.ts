import { Request, Response, NextFunction } from 'express'; import { logger, maskPII } from '../logger.js';
export function auditLog(req:Request,_res:Response,next:NextFunction){const auth=req.header('authorization'); logger.info({path:req.path,token:auth?maskPII(auth):undefined},'audit'); next();}

import { Request, Response, NextFunction } from 'express';
export function errorHandler(err:any,_req:Request,res:Response,_next:NextFunction){res.status(500).json({jsonrpc:'2.0',id:null,error:{code:'INTERNAL_ERROR',message:err.message}});}

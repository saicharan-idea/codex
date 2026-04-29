import { Request, Response, NextFunction } from 'express';
import { validateBearer } from '../auth/session.js';
export function authGuard(req:Request,res:Response,next:NextFunction){ if(req.path==='/health') return next(); if(!validateBearer(req.header('authorization'))){return res.status(401).json({error:'Unauthorized'});} next();}

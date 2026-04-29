export class TrackingService{track(order_id:string){return {order_id,status:'packed',stages:['created','packed','dispatched']};}}

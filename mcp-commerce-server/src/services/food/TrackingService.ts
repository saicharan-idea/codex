export class TrackingService{track(order_id:string){return {order_id,status:'out_for_delivery',stages:['accepted','preparing','picked','out_for_delivery']};}}

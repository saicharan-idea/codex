import { menus } from '../../mocks/foodData.js';
export class MenuService{getMenu(rid:string){return menus[rid as keyof typeof menus]||[];} search(rid:string,q:string){return this.getMenu(rid).filter(i=>i.name.toLowerCase().includes(q.toLowerCase())||i.desc.toLowerCase().includes(q.toLowerCase()));}}

import { addresses } from '../../mocks/groceryData.js';
export class AddressService{list(){return addresses;} isServiceable(id:string){return addresses.find(a=>a.id===id)?.serviceable===true;}}

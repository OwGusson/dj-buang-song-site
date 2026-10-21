import {json} from '../_lib/security.js';
import {contactConfig} from '../_lib/contacts.js';
export function onRequestGet({env}){return json(contactConfig(env));}

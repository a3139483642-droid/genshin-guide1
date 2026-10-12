import {withLambda} from '@netlify/aws-lambda-compat';
import {env} from '../../server/environment.mjs';
import {processImport,processQueue} from '../../server/imports.mjs';
export default withLambda(async event=>{if(!env('SETUP_KEY')||event.headers['x-task-key']!==env('SETUP_KEY'))return {statusCode:403};const body=JSON.parse(event.body||'{}');if(body.id)await processImport(body.id);else await processQueue();return {statusCode:200};});

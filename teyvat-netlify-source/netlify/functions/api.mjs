import serverless from 'serverless-http';
import {withLambda} from '@netlify/aws-lambda-compat';
import {app} from '../../server/app.mjs';
const serve=serverless(app,{binary:['image/*','application/pdf','application/zip','application/octet-stream','application/vnd.openxmlformats-officedocument.wordprocessingml.document']});
export default async(request,context)=>withLambda(async(event,lambdaContext)=>{
  event.path=event.path.replace(/^\/\.netlify\/functions\/api/,'/api');
  event.requestContext={requestId:context.requestId,identity:{sourceIp:context.ip}};
  return serve(event,lambdaContext);
})(request,context);

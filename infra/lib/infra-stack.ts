import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as path from 'path';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const echoFunction = new lambdaNodejs.NodejsFunction(this, 'EchoFunction', {
      entry: path.join(__dirname, '../../apps/api/src/handlers/echo.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
    });

    const itemsFunction = new lambdaNodejs.NodejsFunction(this, 'ItemsFunction', {
      entry: path.join(__dirname, '../../apps/api/src/handlers/items.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DB_HOST: 'host.docker.internal',
        DB_PORT: '3306',
        DB_USER: 'testuser',
        DB_PASSWORD: 'testpass',
        DB_NAME: 'testdb',
      },
    });

    const api = new apigateway.RestApi(this, 'FantasyLineApi', {
      restApiName: 'Fantasy Line API',
    });

    const echoResource = api.root.addResource('echo');
    echoResource.addMethod(
      'ANY',
      new apigateway.LambdaIntegration(echoFunction),
    );

    const itemsResource = api.root.addResource('items');
    itemsResource.addMethod('GET', new apigateway.LambdaIntegration(itemsFunction));
  }
}

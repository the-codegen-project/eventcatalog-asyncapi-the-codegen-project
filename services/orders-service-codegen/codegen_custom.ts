import { TheCodegenConfiguration } from '@the-codegen-project/cli';
const config: TheCodegenConfiguration = {
  inputType: "asyncapi",
  inputPath: "../../eventcatalog/asyncapi-files/orders-service.yml",
  language: "typescript",
  generators: [
    {
      preset: 'custom',
      renderFunction: ({dependencyOutputs}) => {
        console.log(dependencyOutputs['bar'])
      },
      dependencies: ['bar']
    },
    {
      preset: 'custom',
      id: 'bar',
      renderFunction: () => {
        return 'Hello World!'
      }
    }
  ]
};
export default config;
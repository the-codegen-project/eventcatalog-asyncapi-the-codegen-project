import { TheCodegenConfiguration } from '@the-codegen-project/cli';
const config: TheCodegenConfiguration = {
  inputType: "asyncapi",
  inputPath: "../../eventcatalog/asyncapi-files/orders-service.yml",
  language: "typescript",
  generators: [
    {
      preset: 'custom',
      id: 'bar',
      renderFunction: () => {
        return 'Hello World!'
      }
    },
    {
      preset: 'custom',
      dependencies: ['bar'],
      renderFunction: ({dependencyOutputs}) => {
        console.log(dependencyOutputs['bar'])
      }
    },
  ]
};
export default config;
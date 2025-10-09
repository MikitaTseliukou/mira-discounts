import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  Text,
} from '@shopify/ui-extensions-react/admin';

// The target used here must match the target used in the extension's toml file (./shopify.extension.toml)
const TARGET = 'admin.discount-details.function-settings.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  // The useApi hook provides access to several useful APIs like i18n and data.
  const {data} = useApi(TARGET);
  console.log({data});

  return (
    // The AdminBlock component provides an API for setting the title of the Block extension wrapper.
    <AdminBlock title="My Block Extension">
      <BlockStack>
        <Text fontWeight="bold">This extension allows to edit discount settings</Text>
      </BlockStack>
    </AdminBlock>
  );
}
import {extension, AdminBlock, BlockStack, Text} from '@shopify/ui-extensions/admin';

// The target used here must match the target used in the extension's toml file (./shopify.extension.toml)
const TARGET = 'admin.discount-details.function-settings.render';

export default extension(TARGET, (root, api) => {
  console.log({data: api.data});

  const text = root.createComponent(
    Text,
    {fontWeight: 'bold'},
    'This extension allows to edit discount settings',
  );
  const blockStack = root.createComponent(BlockStack, {}, [text]);
  const adminBlock = root.createComponent(
    AdminBlock,
    {title: 'My Block Extension'},
    [blockStack],
  );

  root.appendChild(adminBlock);
  root.mount();
});

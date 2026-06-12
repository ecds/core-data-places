import fs from 'fs';

const CONTEXT_SEPARATOR = '->';

const getLabel = (field) => {
  const label = [];

  if (field.context) {
    label.push(field.context);
    label.push(CONTEXT_SEPARATOR);
  }

  label.push(field.label);

  return label.join(' ');
};

/**
 * Builds TinaCMS pick-list options from the descriptors. Requires the `kind`
 * attribute on each descriptor (Open Geographies connector); against an older
 * Core Data API the lists stay empty and the schema falls back to free-text
 * UUID entry.
 *
 * @param descriptors
 *
 * @returns {{models: [], relationships: [], fields: [], facets: []}}
 */
const buildOptions = (descriptors) => {
  const options = {
    models: [],
    relationships: [],
    fields: [],
    facets: []
  };

  descriptors.forEach((descriptor) => {
    const label = getLabel(descriptor);
    const value = descriptor.identifier;

    switch (descriptor.kind) {
      case 'model':
        options.models.push({ label, value });
        break;
      case 'relationship':
        options.relationships.push({ label, value });
        options.facets.push({
          label: `${label} (related records)`,
          value: `${value}.name_facet`
        });
        break;
      case 'field':
        options.fields.push({
          label: descriptor.data_type ? `${label} (${descriptor.data_type})` : label,
          value
        });
        options.facets.push({ label, value: `${value}_facet` });
        break;
      default:
        break;
    }
  });

  return options;
};

/**
 * Pull in fields/labels from "/projects/:project_id/descriptors".
 *
 * @param config
 *
 * @returns {Promise<void>}
 */
export const buildUserDefinedFields = async (config) => {
  const fields = {};
  const descriptors = [];

  for (const projectId of config.core_data.project_ids) {
    const url = `${config.core_data.url}/core_data/public/v1/projects/${projectId}/descriptors`;
    const payload = await fetch(url).then((response) => response.json());

    payload?.descriptors?.forEach((field) => {
      descriptors.push(field);

      fields[field.identifier] = {
        tinaLabel: getLabel(field),
        defaultValue: field.label
      };

      if (field.inverse_label) {
        fields[`${field.identifier}_inverse`] = {
          tinaLabel: field.inverse_label,
          defaultValue: field.inverse_label
        }
      }
    });
  }

  const content = JSON.stringify(fields, null, 2);
  fs.writeFileSync('./src/i18n/userDefinedFields.json', content, 'utf8');

  const options = JSON.stringify(buildOptions(descriptors), null, 2);
  fs.writeFileSync('./src/i18n/descriptorOptions.json', options, 'utf8');
};

import LinkedText from '@components/LinkedText';
import SafeHtml from '@components/SafeHtml';
import { CheckIcon, XMarkIcon } from '@heroicons/react/16/solid';
import {
  Date as DateUtils,
  FuzzyDate as FuzzyDateUtils,
  UserDefinedFields as UserDefinedFieldUtils
} from '@performant-software/shared-components';
import _ from 'underscore';
import './UserDefinedFieldView.css';

const { DataTypes } = UserDefinedFieldUtils;

interface Props {
  type: string;
  value?: any;
}

const UserDefinedFieldView = (props: Props) => {
  // TODO: Replace with our icons
  if (props.type === DataTypes.boolean) {
    // The icon is decorative; the word is what assistive tech reads.
    return props.value
      ? <><CheckIcon className='h-5 w-5 inline' aria-hidden='true' /><span className='sr-only'>Yes</span></>
      : <><XMarkIcon className='h-5 w-5 inline' aria-hidden='true' /><span className='sr-only'>No</span></>;
  }

  // Only a full date is formatted; anything else ("1983-03-", stored before
  // the upload checked dates) shows as written instead of gaining a day.
  if (props.type === DataTypes.date) {
    if (!props.value) {
      return null;
    }

    return /^\d{4}-\d{2}-\d{2}/.test(String(props.value)) ? DateUtils.formatDate(props.value) : String(props.value);
  }

  if (props.type === DataTypes.fuzzyDate) {
    return FuzzyDateUtils.getDateView(props.value);
  }

  if (props.type === DataTypes.number) {
    return props.value?.toString();
  }

  if (props.type === DataTypes.richText) {
    return (
      <SafeHtml
        className='user-defined-field-view rich-text'
        html={props.value}
      />
    );
  }

  if (props.type === DataTypes.select) {
    return _.isArray(props.value) ? props.value.join(', ') : props.value;
  }

  // Web addresses in text become links (a nomination file, a source record).
  if (props.type === DataTypes.string || props.type === DataTypes.text) {
    return <LinkedText value={props.value} />;
  }

  return null;
};

export default UserDefinedFieldView;
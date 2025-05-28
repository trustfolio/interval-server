import React from 'react'
import { StoryFn, Meta } from '@storybook/react'
import IVRichTextEditor from '.'

export default {
  title: 'Components/IVRichTextEditor',
  component: IVRichTextEditor,
} as Meta<typeof IVRichTextEditor>

const Template: StoryFn<typeof IVRichTextEditor> = args => (
  <IVRichTextEditor {...args} />
)

export const Default = Template.bind({})
Default.args = {
  defaultValue: {
    html: '<h2>Hello!</h2>',
    json: {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: 'Hello!' }] },
      ],
    },
  },
  onChange: () => {
    /* */
  },
}

export const Disabled = Template.bind({})
Disabled.args = {
  disabled: true,
  onChange: () => {
    /* */
  },
}

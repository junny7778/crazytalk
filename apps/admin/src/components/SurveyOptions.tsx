import type { ReactNode } from "react";
import { matchingSurveyOptions, maxSurveyInterests, type StudentSurveyPrefill } from "@crazytalk/shared";
import { Button } from "@crazytalk/ui";

type SurveyOptionsProps<Option extends string> = {
  name: string;
  label: ReactNode;
  hint?: string;
} & (
  | {
      multiple?: false;
      options: readonly Option[];
      required?: boolean;
      value: string;
      onChange: (value: Option | "") => void;
    }
  | {
      multiple: true;
      value: readonly StudentSurveyPrefill["interests"][number][];
      onChange: (value: StudentSurveyPrefill["interests"]) => void;
    }
);

export default function SurveyOptions<Option extends string>(props: SurveyOptionsProps<Option>) {
  const { name, label, hint } = props;
  return (
    <fieldset className="survey-question">
      <legend>{label}</legend>
      {hint && <small>{hint}</small>}
      {props.multiple ? (
        <small aria-live="polite">最多选择 {maxSurveyInterests} 项，已选择 {props.value.length}/{maxSurveyInterests} 项</small>
      ) : props.value && !props.options.some((option) => option === props.value) ? (
        <small>当前记录：{props.value}</small>
      ) : null}
      <div className="survey-choices">
        {props.multiple ? matchingSurveyOptions.interests.map((option) => (
          <label className="survey-option" key={option}>
            <input
              type="checkbox"
              name={name}
              value={option}
              checked={props.value.includes(option)}
              disabled={props.value.length >= maxSurveyInterests && !props.value.includes(option)}
              onChange={(event) => props.onChange(event.target.checked
                ? [...props.value, option]
                : props.value.filter((item) => item !== option))}
            />
            <span>{option}</span>
          </label>
        )) : props.options.map((option) => (
          <label className="survey-option" key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={props.value === option}
              required={props.required}
              onChange={() => props.onChange(option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
      {!props.multiple && !props.required && props.value && (
        <div><Button size="xs" variant="ghost" onClick={() => props.onChange("")}>清除选择</Button></div>
      )}
    </fieldset>
  );
}

import { act, fireEvent, screen, within } from "@testing-library/react";
export async function clickSchedule(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
export async function selectSchedule(label: string, option: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("combobox", { name: label }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("option", { name: option }));
  });
}
export async function selectStudentCard(name: string, id?: string) {
  await act(async () => {
    fireEvent.click(
      within(document.querySelector(".schedule-student-options")!).getByRole(
        "radio",
        { name: new RegExp(id ? `${name}.*ID ${id}` : name) },
      ),
    );
  });
}
export async function addCalendarLesson(date: string, time: string) {
  await clickSchedule(new RegExp(`${date} ${time} 可排课`));
  await act(async () => {
    fireEvent.click(
      document.querySelector("[role=dialog] .flex-teacher-choice")!,
    );
  });
  await clickSchedule("加入课表");
}

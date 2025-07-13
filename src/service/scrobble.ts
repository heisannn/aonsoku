import { httpClient } from '@/api/httpClient'
import { SubsonicResponse } from '@/types/responses/subsonicResponse'
import dateTime from '@/utils/dateTime'

async function send(id: string, isSubmission: boolean) {
  await httpClient<SubsonicResponse>('/scrobble', {
    method: 'GET',
    query: {
      id,
      time: dateTime().valueOf().toString(),
      submission: isSubmission.toString(),
    },
  })
}

export const scrobble = {
  send,
}

import clsx from 'clsx'
import {
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ProgressSlider } from '@/app/components/ui/slider'
import { podcasts } from '@/service/podcasts'
import {
  usePlayerActions,
  usePlayerDuration,
  usePlayerMediaType,
  usePlayerProgress,
  usePlayerSonglist,
  usePlayerIsPlaying,
} from '@/store/player.store'
import { convertSecondsToTime } from '@/utils/convertSecondsToTime'
import { logger } from '@/utils/logger'

interface PlayerProgressProps {
  audioRef: RefObject<HTMLAudioElement>
}

let isSeeking = false

export function PlayerProgress({ audioRef }: PlayerProgressProps) {
  const progress = usePlayerProgress()
  const [localProgress, setLocalProgress] = useState(progress)
  const currentDuration = usePlayerDuration()
  const isPlaying = usePlayerIsPlaying()
  const { currentSong, currentList, podcastList, currentSongIndex } =
    usePlayerSonglist()
  const { isSong, isPodcast } = usePlayerMediaType()
  const {
    setProgress,
    setUpdatePodcastProgress,
    getCurrentPodcastProgress,
    handleScrobbleOnPause,
    handleScrobbleOnResume,
    handleScrobbleOnSongChange,
  } = usePlayerActions()

  const isEmpty = isSong && currentList.length === 0
  const previousSongRef = useRef(currentSong)
  const wasPlayingRef = useRef(isPlaying)

  // Track song changes
  useEffect(() => {
    if (currentSong.id !== previousSongRef.current.id) {
      const previousSong = previousSongRef.current.id
        ? previousSongRef.current
        : undefined
      handleScrobbleOnSongChange(previousSong)
      previousSongRef.current = currentSong
    }
  }, [currentSong, handleScrobbleOnSongChange])

  // Track play/pause changes
  useEffect(() => {
    if (wasPlayingRef.current !== isPlaying) {
      if (isPlaying) {
        // Song was resumed
        handleScrobbleOnResume()
      } else {
        // Song was paused
        handleScrobbleOnPause()
      }
      wasPlayingRef.current = isPlaying
    }
  }, [isPlaying, handleScrobbleOnPause, handleScrobbleOnResume])

  const updateAudioCurrentTime = useCallback(
    (value: number) => {
      isSeeking = false
      if (audioRef.current) {
        audioRef.current.currentTime = value
      }
    },
    [audioRef],
  )

  const handleSeeking = useCallback((amount: number) => {
    isSeeking = true
    setLocalProgress(amount)
  }, [])

  const handleSeeked = useCallback(
    (amount: number) => {
      updateAudioCurrentTime(amount)
      setProgress(amount)
      setLocalProgress(amount)
    },
    [setProgress, updateAudioCurrentTime],
  )

  const handleSeekedFallback = useCallback(() => {
    if (localProgress !== progress) {
      updateAudioCurrentTime(localProgress)
      setProgress(localProgress)
    }
  }, [localProgress, progress, setProgress, updateAudioCurrentTime])

  const songDuration = useMemo(
    () => convertSecondsToTime(currentDuration ?? 0),
    [currentDuration],
  )

  // Used to save listening progress to backend every 30 seconds
  useEffect(() => {
    if (!isPodcast || !podcastList) return
    if (progress === 0) return

    const send = (progress / 30) % 1 === 0
    if (!send) return

    const podcast = podcastList[currentSongIndex] ?? null
    if (!podcast) return

    const podcastProgress = getCurrentPodcastProgress()
    if (progress === podcastProgress) return

    setUpdatePodcastProgress(progress)

    podcasts
      .saveEpisodeProgress(podcast.id, progress)
      .then(() => {
        logger.info('Progress sent:', progress)
      })
      .catch((error) => {
        logger.error('Error sending progress', error)
      })
  }, [
    currentSongIndex,
    getCurrentPodcastProgress,
    isPodcast,
    podcastList,
    progress,
    setUpdatePodcastProgress,
  ])

  const currentTime = convertSecondsToTime(isSeeking ? localProgress : progress)

  const isProgressLarge = useMemo(() => {
    return localProgress >= 3600 || progress >= 3600
  }, [localProgress, progress])

  const isDurationLarge = useMemo(() => {
    return currentDuration >= 3600
  }, [currentDuration])

  return (
    <div
      className={clsx(
        'flex w-full justify-center items-center gap-2',
        isEmpty && 'opacity-50',
      )}
    >
      <small
        className={clsx(
          'text-xs text-muted-foreground text-right',
          isProgressLarge ? 'min-w-14' : 'min-w-10',
        )}
        data-testid="player-current-time"
      >
        {currentTime}
      </small>
      {!isEmpty || isPodcast ? (
        <ProgressSlider
          defaultValue={[0]}
          value={isSeeking ? [localProgress] : [progress]}
          tooltipTransformer={convertSecondsToTime}
          max={currentDuration}
          step={1}
          className="cursor-pointer w-[32rem]"
          onValueChange={([value]) => handleSeeking(value)}
          onValueCommit={([value]) => handleSeeked(value)}
          // Sometimes onValueCommit doesn't work properly
          // so we also have to set the value on pointer/mouse up events
          // see https://github.com/radix-ui/primitives/issues/1760
          onPointerUp={handleSeekedFallback}
          onMouseUp={handleSeekedFallback}
          data-testid="player-progress-slider"
        />
      ) : (
        <ProgressSlider
          defaultValue={[0]}
          max={100}
          step={1}
          disabled={true}
          className="cursor-pointer w-[32rem] pointer-events-none"
        />
      )}
      <small
        className={clsx(
          'text-xs text-muted-foreground text-left',
          isDurationLarge ? 'min-w-14' : 'min-w-10',
        )}
        data-testid="player-duration-time"
      >
        {songDuration}
      </small>
    </div>
  )
}

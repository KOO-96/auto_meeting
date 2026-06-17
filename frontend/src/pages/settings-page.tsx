import { useEffect, useState } from 'react'
import { FolderOpen, Save } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getElectronAPI } from '@/lib/electron'
import type { AppSettings } from '@/types/electron'

const fallbackSettings: AppSettings = {
  defaultSaveDirectory: '~/CompanyBrain',
  downloadDirectory: '~/CompanyBrain/downloads',
  backendApiUrl: 'http://localhost:8000',
  screenRecordingFormat: 'webm',
  audioRecordingFormat: 'webm',
  autoSave: true,
  notifyOnProcessingComplete: true,
}

export function SettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(() =>
    getElectronAPI() ? null : fallbackSettings,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(() =>
    getElectronAPI()
      ? null
      : 'Electron 실행 환경에서만 로컬 경로 설정을 불러올 수 있습니다.',
  )
  const [electronAvailable] = useState(() => Boolean(getElectronAPI()))

  useEffect(() => {
    const electron = getElectronAPI()

    if (!electron) {
      return
    }

    void electron
      .getAppSettings()
      .then(setSettings)
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error
            ? error.message
            : '설정을 불러오지 못했습니다.',
        )
        setSettings(fallbackSettings)
      })
  }, [])

  const update = (patch: Partial<AppSettings>): void => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const save = async (): Promise<void> => {
    if (!settings) {
      return
    }

    const electron = getElectronAPI()

    if (!electron) {
      setMessage('브라우저 미리보기에서는 설정 저장을 사용할 수 없습니다.')
      return
    }

    try {
      const next = await electron.updateAppSettings(settings)
      setSettings(next)
      setMessage('설정이 저장되었습니다.')
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '설정 저장에 실패했습니다.',
      )
    }
  }

  const selectDefaultPath = async (): Promise<void> => {
    const electron = getElectronAPI()

    if (!electron) {
      setMessage('Electron 앱에서만 폴더를 선택할 수 있습니다.')
      return
    }

    const selected = await electron.selectDefaultSaveDirectory()

    if (selected) {
      update({ defaultSaveDirectory: selected })
    }
  }

  const openLogDirectory = async (): Promise<void> => {
    const electron = getElectronAPI()

    if (!electron) {
      setMessage('Electron 앱에서만 로그 폴더를 열 수 있습니다.')
      return
    }

    await electron.openLogDirectory()
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground">설정을 불러오는 중입니다.</p>
  }

  return (
    <div>
      <PageHeader
        title="설정"
        description="저장 경로, Backend API URL, 알림과 로그 위치를 관리합니다."
        actions={
          <Button type="button" onClick={save}>
            <Save className="h-4 w-4" />
            저장
          </Button>
        }
      />

      <div className="grid grid-cols-[1fr_360px] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>앱 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {loadError ? (
              <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                {loadError}
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="default-path">기본 저장 경로</Label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  id="default-path"
                  value={settings.defaultSaveDirectory}
                  onChange={(event) =>
                    update({ defaultSaveDirectory: event.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={selectDefaultPath}
                >
                  <FolderOpen className="h-4 w-4" />
                  선택
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="download-path">다운로드 경로</Label>
              <Input
                id="download-path"
                value={settings.downloadDirectory}
                onChange={(event) =>
                  update({ downloadDirectory: event.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="backend-url">Backend API URL</Label>
              <Input
                id="backend-url"
                value={settings.backendApiUrl}
                onChange={(event) => update({ backendApiUrl: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>화면 녹화 포맷</Label>
                <Input value={settings.screenRecordingFormat} disabled />
              </div>
              <div className="space-y-2">
                <Label>음성 녹음 포맷</Label>
                <Input value={settings.audioRecordingFormat} disabled />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">자동 저장</p>
                <p className="text-xs text-muted-foreground">
                  메모 입력 시 로컬 JSON에 즉시 저장합니다.
                </p>
              </div>
              <Switch
                checked={settings.autoSave}
                onCheckedChange={(checked) => update({ autoSave: checked })}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">처리 완료 알림</p>
                <p className="text-xs text-muted-foreground">
                  완료 또는 실패 상태가 되면 모달을 표시합니다.
                </p>
              </div>
              <Switch
                checked={settings.notifyOnProcessingComplete}
                onCheckedChange={(checked) =>
                  update({ notifyOnProcessingComplete: checked })
                }
              />
            </div>

            {message ? (
              <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                {message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>로그와 보관 정책</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={!electronAvailable}
              onClick={openLogDirectory}
            >
              <FolderOpen className="h-4 w-4" />
              로그 폴더 열기
            </Button>
            <p className="leading-6 text-muted-foreground">
              원본 파일은 사용자가 선택한 저장 경로 아래 회의별 폴더에
              저장됩니다. MVP에서는 자동 업로드, 자동 삭제, 암호화, 파일 변환을
              수행하지 않습니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

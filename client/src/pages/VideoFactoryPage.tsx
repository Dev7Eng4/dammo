import { VideoFactoryForm } from '../components/video-factory/VideoFactoryForm';
import { useToast } from '../components/ui';

export function VideoFactoryPage() {
  const { toast } = useToast();

  return (
    <div className="-m-6 flex h-svh flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-neutral-100">Create Video</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Configure a new render job and add it to the queue.
          </p>
        </div>

        <div className="card-surface p-5">
          <VideoFactoryForm
            onQueued={() => toast.success('Video queued for render')}
            onError={(message) => toast.error(message)}
          />
        </div>
      </div>
    </div>
  );
}

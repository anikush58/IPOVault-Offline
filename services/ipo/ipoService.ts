import { SQLiteDatabase } from 'expo-sqlite';
import { IPORepository } from './ipoRepository';
import { IPOUpdater } from './ipoUpdater';
import { IPOScheduler } from './ipoScheduler';
import { IPOProviderFactory, ProviderType } from './providers/IPOProviderFactory';

export class IPOService {
  public repository: IPORepository;
  public updater: IPOUpdater;
  public scheduler: IPOScheduler;

  constructor(db: SQLiteDatabase, providerType?: ProviderType) {
    this.repository = new IPORepository(db);
    const provider = IPOProviderFactory.getProvider(providerType);
    
    this.updater = new IPOUpdater(this.repository, provider);
    this.scheduler = new IPOScheduler(this.updater);
  }

  // Helper to start scheduling lifecycle
  startBackgroundUpdates() {
    this.scheduler.start();
  }

  // Helper to stop
  stopBackgroundUpdates() {
    this.scheduler.stop();
  }
}

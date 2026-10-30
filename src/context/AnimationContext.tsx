import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { ErrorDetails, logSystemErrorToFirestore } from '../services/errorSystem';
import { GlobalErrorAlert } from '../components/common/GlobalErrorAlert';
import { GlobalLoadingAnimation } from '../components/common/GlobalLoadingAnimation';
import { GlobalRefreshAnimation } from '../components/common/GlobalRefreshAnimation';

export interface LoadingConfig {
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
}

interface AnimationContextType {
  // Global Error Alert Modal
  showGlobalError: (details: ErrorDetails) => void;
  closeGlobalError: () => void;
  activeError: ErrorDetails | null;

  // Global Loading System
  isLoading: boolean;
  loadingConfig: LoadingConfig;
  startLoading: (config?: LoadingConfig | string) => void;
  stopLoading: () => void;

  // Global Refresh Animation
  isRefreshing: boolean;
  refreshMessage: { message: string; subMessage: string };
  triggerRefresh: (
    action?: () => Promise<void> | void,
    message?: string,
    subMessage?: string
  ) => Promise<void>;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export const AnimationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Error state
  const [activeError, setActiveError] = useState<ErrorDetails | null>(null);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState<LoadingConfig>({
    title: 'LOADING APPLICATION...',
    subtitle: 'Synchronizing your workspace',
    fullScreen: true
  });

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState({
    message: 'MEMPERBARUI DATA...',
    subMessage: 'Menyelaraskan data Work Order & Schedule'
  });

  const refreshTimeoutRef = useRef<any>(null);

  const showGlobalError = useCallback((details: ErrorDetails) => {
    setActiveError(details);
    // Asynchronously log incident to Firestore without blocking user
    logSystemErrorToFirestore(details).catch(() => {});
  }, []);

  const closeGlobalError = useCallback(() => {
    setActiveError(null);
  }, []);

  const startLoading = useCallback((config?: LoadingConfig | string) => {
    if (typeof config === 'string') {
      setLoadingConfig({
        title: config,
        subtitle: 'Mohon tunggu, memproses data...',
        fullScreen: true
      });
    } else if (config) {
      setLoadingConfig({
        title: config.title || 'LOADING APPLICATION...',
        subtitle: config.subtitle || 'Synchronizing your workspace',
        fullScreen: config.fullScreen !== undefined ? config.fullScreen : true
      });
    } else {
      setLoadingConfig({
        title: 'LOADING APPLICATION...',
        subtitle: 'Synchronizing your workspace',
        fullScreen: true
      });
    }
    setIsLoading(true);
  }, []);

  const stopLoading = useCallback(() => {
    setIsLoading(false);
  }, []);

  const triggerRefresh = useCallback(async (
    action?: () => Promise<void> | void,
    message: string = 'MEMPERBARUI DATA...',
    subMessage: string = 'Menyelaraskan data Work Order & Schedule'
  ) => {
    if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    setRefreshMessage({ message, subMessage });
    setIsRefreshing(true);

    const minDisplayPromise = new Promise(resolve => setTimeout(resolve, 600));

    try {
      if (action) {
        await Promise.all([Promise.resolve(action()), minDisplayPromise]);
      } else {
        await minDisplayPromise;
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return (
    <AnimationContext.Provider
      value={{
        showGlobalError,
        closeGlobalError,
        activeError,
        isLoading,
        loadingConfig,
        startLoading,
        stopLoading,
        isRefreshing,
        refreshMessage,
        triggerRefresh
      }}
    >
      {children}

      {/* Global Refresh Animation Overlay */}
      <GlobalRefreshAnimation
        isVisible={isRefreshing}
        message={refreshMessage.message}
        subMessage={refreshMessage.subMessage}
      />

      {/* Global Loading Overlay */}
      {isLoading && (
        <GlobalLoadingAnimation
          fullScreen={loadingConfig.fullScreen}
          title={loadingConfig.title}
          subtitle={loadingConfig.subtitle}
        />
      )}

      {/* Global Error Alert Modal */}
      <GlobalErrorAlert
        error={activeError}
        isOpen={Boolean(activeError)}
        onClose={closeGlobalError}
      />
    </AnimationContext.Provider>
  );
};

export const useAnimation = (): AnimationContextType => {
  const context = useContext(AnimationContext);
  if (!context) {
    throw new Error('useAnimation must be used within an AnimationProvider');
  }
  return context;
};

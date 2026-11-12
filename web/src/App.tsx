/**
 * The app screens. There is no login: everything is local and belongs to one person. The lesson and the checkpoint
 * take the whole screen (`immersive`); the rest lives in the shell with the navigation.
 */

import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Shell } from '@/components/Shell'
import { Loading } from '@/components/ui'
import Home from '@/pages/Home'
import Course from '@/pages/Course'
import NewCourse from '@/pages/NewCourse'
import Creating from '@/pages/Creating'
import { useLanguage } from '@/i18n'
import { LanguagePicker } from '@/i18n/LanguagePicker'

const Lesson = lazy(() => import('@/pages/Lesson'))
const Checkpoint = lazy(() => import('@/pages/Checkpoint'))
const Feynman = lazy(() => import('@/pages/Feynman'))
const Teacher = lazy(() => import('@/pages/Teacher'))
const Review = lazy(() => import('@/pages/Review'))
const Community = lazy(() => import('@/pages/Community'))
const Profile = lazy(() => import('@/pages/Profile'))
const Certificate = lazy(() => import('@/pages/Certificate'))

function Screen({ children, immersive }: { children: ReactNode; immersive?: boolean }) {
  return (
    <Shell immersive={immersive}>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </Shell>
  )
}

export default function App() {
  const picked = useLanguage((s) => s.picked)
  // re-render everything when the language changes
  const language = useLanguage((s) => s.language)
  if (!picked) return <LanguagePicker />
  return (
    <BrowserRouter key={language}>
      <Routes>
        <Route
          path="/"
          element={
            <Screen>
              <Home />
            </Screen>
          }
        />
        <Route
          path="/new"
          element={
            <Screen>
              <NewCourse />
            </Screen>
          }
        />
        <Route
          path="/creating/:slug"
          element={
            <Screen>
              <Creating />
            </Screen>
          }
        />
        <Route
          path="/courses/:id"
          element={
            <Screen>
              <Course />
            </Screen>
          }
        />
        <Route
          path="/courses/:id/lessons/:lessonId"
          element={
            <Screen immersive>
              <Lesson />
            </Screen>
          }
        />
        <Route
          path="/courses/:id/teacher"
          element={
            <Screen immersive>
              <Teacher />
            </Screen>
          }
        />
        <Route
          path="/courses/:id/modules/:order/feynman"
          element={
            <Screen immersive>
              <Feynman />
            </Screen>
          }
        />
        <Route
          path="/courses/:id/modules/:order/checkpoint"
          element={
            <Screen immersive>
              <Checkpoint />
            </Screen>
          }
        />
        <Route
          path="/review"
          element={
            <Screen>
              <Review />
            </Screen>
          }
        />
        <Route
          path="/community"
          element={
            <Screen>
              <Community />
            </Screen>
          }
        />
        <Route
          path="/profile"
          element={
            <Screen>
              <Profile />
            </Screen>
          }
        />
        <Route
          path="/certificates/:code"
          element={
            <Screen immersive>
              <Certificate />
            </Screen>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

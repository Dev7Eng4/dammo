import { useState } from 'react'
import reactLogo from './assets/react.svg'
import {
  Button,
  HomeIcon,
  Image,
  NavBar,
  Progress,
  SearchIcon,
  SearchInput,
  UserIcon,
} from './components/ui'

const colorGroups = [
  {
    name: 'Primary',
    token: '#3B82F6',
    shades: [
      'bg-primary-950',
      'bg-primary-900',
      'bg-primary-800',
      'bg-primary-700',
      'bg-primary-600',
      'bg-primary-500',
      'bg-primary-400',
      'bg-primary-300',
      'bg-primary-200',
      'bg-primary-100',
      'bg-primary-50',
    ],
  },
  {
    name: 'Secondary',
    token: '#06B6D4',
    shades: [
      'bg-secondary-950',
      'bg-secondary-900',
      'bg-secondary-800',
      'bg-secondary-700',
      'bg-secondary-600',
      'bg-secondary-500',
      'bg-secondary-400',
      'bg-secondary-300',
      'bg-secondary-200',
      'bg-secondary-100',
      'bg-secondary-50',
    ],
  },
  {
    name: 'Tertiary',
    token: '#D16900',
    shades: [
      'bg-tertiary-950',
      'bg-tertiary-900',
      'bg-tertiary-800',
      'bg-tertiary-700',
      'bg-tertiary-600',
      'bg-tertiary-500',
      'bg-tertiary-400',
      'bg-tertiary-300',
      'bg-tertiary-200',
      'bg-tertiary-100',
      'bg-tertiary-50',
    ],
  },
  {
    name: 'Neutral',
    token: '#8B949E',
    shades: [
      'bg-neutral-950',
      'bg-neutral-900',
      'bg-neutral-800',
      'bg-neutral-700',
      'bg-neutral-600',
      'bg-neutral-500',
      'bg-neutral-400',
      'bg-neutral-300',
      'bg-neutral-200',
      'bg-neutral-100',
      'bg-neutral-50',
    ],
  },
] as const

function App() {
  const [activeNav, setActiveNav] = useState('home')

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-headline">Design System</h1>
        <p className="text-body mt-2">Màu sắc và common components theo UI kit</p>
      </header>

      <section className="card-surface mb-6">
        <h2 className="text-label mb-4">Color</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {colorGroups.map((group) => (
            <div key={group.name}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-100">{group.name}</span>
                <span className="text-xs text-neutral-400">{group.token}</span>
              </div>
              <div className="flex overflow-hidden rounded-xl">
                {group.shades.map((shade) => (
                  <div key={shade} className={`h-10 flex-1 ${shade}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card-surface mb-6">
        <h2 className="text-label mb-4">Typography</h2>
        <div className="space-y-4">
          <p className="text-headline">Headline</p>
          <p className="text-body">Body — React + Vite + Node.js monorepo</p>
          <p className="text-label">Label</p>
        </div>
      </section>

      <section className="card-surface mb-6">
        <h2 className="text-label mb-4">Button</h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="inverted">Inverted</Button>
          <Button variant="outlined">Outlined</Button>
          <Button variant="primary" size="icon" aria-label="Edit">
            <PencilIcon />
          </Button>
        </div>
      </section>

      <section className="card-surface mb-6">
        <h2 className="text-label mb-4">Input</h2>
        <SearchInput className="max-w-md" />
      </section>

      <section className="card-surface mb-6">
        <h2 className="text-label mb-4">Image</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Image src={reactLogo} alt="React logo" aspectRatio="square" rounded="lg" fit="contain" />
          <Image
            src="https://picsum.photos/seed/dammo/400/300"
            alt="Sample photo"
            aspectRatio="video"
            rounded="lg"
          />
          <Image src={null} alt="Broken image" aspectRatio="video" rounded="lg" />
        </div>
      </section>

      <section className="card-surface mb-6">
        <h2 className="text-label mb-4">Navigation</h2>
        <NavBar
          activeId={activeNav}
          onChange={setActiveNav}
          items={[
            { id: 'home', label: 'Home', icon: <HomeIcon /> },
            { id: 'search', label: 'Search', icon: <SearchIcon /> },
            { id: 'profile', label: 'Profile', icon: <UserIcon /> },
          ]}
        />
      </section>

      <section className="card-surface">
        <h2 className="text-label mb-4">Progress</h2>
        <div className="space-y-4">
          <Progress value={80} tone="primary" />
          <Progress value={55} tone="secondary" />
          <Progress value={35} tone="tertiary" />
        </div>
      </section>
    </main>
  )
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="size-4">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1 1 0 0 0 0-1.41l-2.5-2.5a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.99-1.67Z" />
    </svg>
  )
}

export default App

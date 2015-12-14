var app = {
  name: 'Sarah',
  repo: 'nijikokun/sarah',
  tagline: 'Compare Node.js Package Dependencies',
  param: m.route.param,
  routes: {},
  components: {},
  store: {},
  events: {}
}

// Helpers
app.init = function (location) {
  m.route.mode = 'pathname'
  m.route(location, '/', app.routes)
}

app.title = function (title) {
  window.document.title = title + ' - ' + app.name
}

app.route = function (route, obj) {
  app.routes[route] = obj
}

app.decodeBase64 = function decodeFromBase64 (input) {
  return atob(input.replace(/\s/g, ''))
}

app.parseRepo = function (repo) {
  var branch = 'master'
  var version = null

  if (repo.indexOf('@') > -1) {
    repo = repo.split('@')
    version = repo[1]
    repo = repo[0]
  }

  if (repo.split('/').length === 3) {
    repo = repo.split('/')
    branch = repo.pop()
    repo = repo.join('/')
  }

  return {
    repo: repo,
    version: version,
    branch: branch
  }
}

app.fetch = function (package, callback) {
  var count = 0
  var total = 3
  var data = {}
  var branch = package.branch
  var repo = package.repo

  var onSuccess = function () {
    count++
    if (count === total) {
      callback(null, data)
    }
  }

  var onFailure = function () {
    callback(404)
  }

  var fetchDavidDetails = function () {
    var version = package.version ? '/' + package.version : ''
    data.david = {}

    $.getJSON("https://david-dm.org/" + repo + version + "/info.json", function (david) {
      data.david.dependencies = david
      return onSuccess()
    }).fail(onFailure)

    $.getJSON("https://david-dm.org/" + repo + version + "/dev-info.json", function (david) {
      data.david.devDependencies = david
      return onSuccess()
    }).fail(onFailure)

    $.getJSON("https://david-dm.org/" + repo + version + "/optional-info.json", function (david) {
      data.david.optionalDependencies = david
      return onSuccess()
    }).fail(onFailure)
  }

  $.getJSON("https://api.github.com/repos/" + repo + "/contents/package.json?ref=" + branch, function (blob) {
    if (!blob.content) {
      return onFailure()
    }

    data = JSON.parse(app.decodeBase64(blob.content))

    if (package.version) {
      return $.getJSON("http://cors.maxogden.com/registry.npmjs.org/" + data.name + "?version=" + package.version, function (pkg) {
        var dependencies
        data = pkg

        // Registry has duplicate entries for both dependencies and optionalDependencies
        // It honestly doesn't give a fudge about your package.json
        //
        // So here we do a lookup between these two objects, first we create a new object prepping the clone,
        // then we do the lookup, and copy the items that are not shared.
        if (data.optionalDependencies) {
          dependencies = data.dependencies
          data.dependencies = {}
          Object.keys(dependencies).forEach(function (dependency) {
            if (!data.optionalDependencies[dependency] || dependencies[dependency] !== data.optionalDependencies[dependency]) {
              data.dependencies[dependency] = dependencies[dependency]
            }
          })
        }

        return fetchDavidDetails()
      }).fail(onFailure)
    }

    return fetchDavidDetails()
  }).fail(onFailure)
}

// Events
app.events.accordion = function (e, a) {
  if (a) return
  var self = $(e)
  var panels = self.find('.accordion-toggle')
  var contents = self.find('.accordion-content')

  contents.not('.default').hide()

  panels.click(function () {
    var instance = $(this)
    if (instance.hasClass('active')) return
    var next = instance.next()
    panels.removeClass('active')
    instance.addClass('active')
    contents.slideUp('fast')
    next.slideDown('fast')
    return
  })
}

// Components
app.components.header = function (options) {
  return m('header', [
    m('.container', [
      m('ul.nav', [
        m('li', m('a', {
          href: 'http://github.com/' + app.repo,
          target: '_blank',
        }, m('span..fa.fa-github')))
      ]),

      m('h1', m('a[href="/"]', {
        config: m.route,
      }, app.name + '.'))
    ])
  ])
}

app.components.compare = function (options) {
  app.store.a = app.store.a || m.prop('')
  app.store.b = app.store.b || m.prop('')

  return m('div.compare', [
    m('h2.compare-header', app.tagline),
    m('input.compare-input', {
      placeholder: 'Username/Repo',
      onchange: m.withAttr("value", app.store.a),
      value: app.store.a()
    }),

    m('span.compare-vs', 'vs'),
    m('input.compare-input', {
      placeholder: 'Username/Repo',
      onchange: m.withAttr("value", app.store.b),
      value: app.store.b()
    }),

    m('div.compare-button-container', [
      m('a.compare-button.like-button', {
        config: function (e, a) {
          if (a) return
          e.onclick = function () {
            var abort = false
            $(e).addClass('liked')
            setTimeout(function () {
              $(e).removeClass('liked')
              if (!abort) {
                m.route("/compare/" + encodeURIComponent(app.store.a()) + "/" + encodeURIComponent(app.store.b()))
              }
            }, 700)
            if (!app.store.a() || !app.store.b()) {
              abort = true
              return alert('Two packages required to compare')
            }
          }
        }
      }, [
       m('span.like-icon', [
         m('div.heart-animation-1'),
         m('div.heart-animation-2')
       ]),
       'Compare Modules'
      ])
    ])
  ])
}

app.components.comparison = function (options) {
  var packages = []
  var results = options.packages.map(function (package) {
    packages.push(package.data.name)
    return app.components.package(package.repo, package.data)
  })

  return [
    m('h2.comparison-header', [
      'Comparison Results',
      app.components.twitter({
        text: 'I just compared ' + packages.join(' vs ') + ' with http://sarahjs.com',
        hashtags: 'nodejs'
      })
    ]),
    m('div.packages', results)
  ]
}

app.components.package = function (repo, options) {
  var numbers = { total: 0 }
  var children = []
  var names = []

  children.push(app.components.packageDependencyList({
    repo: repo,
    numbers: numbers,
    title: 'Dependencies',
    list: options.dependencies,
    slug: 'dependencies',
    active: true,
    david: options.david.dependencies,
    status: options.david.dependencies ? options.david.dependencies.status : 'unknown'
  }))

  children.push(app.components.packageDependencyList({
    repo: repo,
    numbers: numbers,
    title: 'Optional Dependencies',
    list: options.optionalDependencies,
    slug: 'optionalDependencies',
    david: options.david.optionalDependencies,
    status: options.david.optionalDependencies ? options.david.optionalDependencies.status : 'unknown'
  }))

  children.push(app.components.packageDependencyList({
    repo: repo,
    numbers: numbers,
    title: 'Dev Dependencies',
    list: options.devDependencies,
    slug: 'devDependencies',
    david: options.david.devDependencies,
    status: options.david.devDependencies ? options.david.devDependencies.status : 'unknown'
  }))

  return m('div.comparison-package', [
    m('h2.comparison-package-header', [
      m('span.comparison-package-count', numbers.total),
      m('span.comparison-package-github', m('a', {
        href: 'http://github.com/' + repo,
        target: '_blank',
      }, m('span..fa.fa-github'))),
      m('span.comparison-package-name', options.name),
      m('span.comparison-package-version', 'v' + options.version),
    ]),
    m('div.accordion', {
      config: app.events.accordion
    }, children)
  ])
}

app.components.twitter = function (options) {
  return m('a', {
    href: "https://twitter.com/share",
    className: "twitter-share-button",
    'data-text': options.text,
    'data-hashtags': options.hashtags,
    config: function (e, a) {
      if (a) return
      window.twttr.widgets.load(e)
    }
  }, 'Share Results')
}

app.components.david = function (options) {
  var status = 'unknown'

  switch (options.status) {
    case "uptodate": status = 'Up to date'; break
    case "notsouptodate": status = 'Up to date'; break
    case "outofdate": status = 'Out of date'; break
    case "insecure": status = 'Insecure'; break
    case "none": status = 'None'; break
  }

  return m('a', {
    className: 'status-' + options.status,
    title: options.slug + ' status',
    href: 'https://david-dm.org/' + options.repo + (options.slug !== 'dependencies' ? '#info=' + options.slug : '')
  }, status)
}

app.components.davidBadge = function (options) {
  var type = ''
  var badge

  if (options.slug === 'devDependencies') {
    type = 'dev/'
  }

  if (options.slug === 'optionalDependencies') {
    type = 'optional/'
  }

  badge = m('a', {
    title: options.slug + ' status',
    href: 'https://david-dm.org/' + options.repo + (type ? '#info=' + options.slug : '')
  }, m('img', {
    src: 'https://img.shields.io/david/' + type + options.repo + '.svg'
  }))

  if (options.tooltip) {
    return m('a.badge-info.tooltip-component', [
      m('span.icon.entypo-info'),
      m('div.tooltip', badge)
    ])
  }

  return badge
}

app.components.packageDependencyList = function (options) {
  options.names = Object.keys(options.list || {})
  options.numbers.total += options.names.length
  options.numbers[options.title] = options.names.length

  return app.components.accordionItem({
    active: options.active,
    title: [
      m('span.accordion-title', options.title),
      m('span.accordion-count', options.names.length),
      m('span.accordion-badge', app.components.david(options)),
    ],
    content: m('ul.comparison-package-dependencies', options.names.length ? options.names.map(function (name) {
      var david = options.david ? _.find(options.david.deps, { name: name }) : {}
      var outdated = david ? david.outOfDate : false
      var security = david ? david.advisories.length ? david.advisories[0] : false : false

      return m('li.dependency', [
        m('span.dependency-name', {
          className: outdated ? 'status-outofdate' : security ? 'status-insecure' : ''
        }, name),
        m('span.dependency-version', options.list[name]),
        m('span.dependency-outdated', outdated ? ' -> ' + david.stable : ''),
        m('span.dependency-vunerability', security ? m('div.tooltip-component', [
          security.title,
          m('div.tooltip', security.recommendation)
        ]) : '')
      ])
    }) : m('li.empty', 'No ' + options.title.toLowerCase() + ' for this package.'))
  })
}

app.components.accordionItem = function (options) {
  return [
    m('h4.accordion-toggle', {
      className: options.active ? 'active' : ''
    }, options.title),
    m('div.accordion-content', {
      className: options.active ? 'default' : ''
    }, options.content)
  ]
}

// Routes
app.route('/', {
  controller: function() {
    return {}
  },

  view: function (ctrl) {
    app.title(app.tagline)

    return m("div.homepage", [
      app.components.header(),
      app.components.compare(ctrl)
    ])
  }
})

app.route('/compare/:one/:two', {
  controller: function () {
    var ctrl = this

    this.one = app.parseRepo(app.param('one'))
    this.two = app.parseRepo(app.param('two'))

    this.error = false

    app.fetch(this.one, function (err, data) {
      if (err) {
        ctrl.error = ctrl.one.repo + ' is missing package.json'
        return m.redraw()
      }

      ctrl.one.data = data
      m.redraw()
    })

    app.fetch(this.two, function (err, data) {
      if (err) {
        ctrl.error = ctrl.two.repo + ' is missing package.json'
        return m.redraw()
      }

      ctrl.two.data = data
      m.redraw()
    })
  },

  view: function (ctrl) {
    var children = []

    if (ctrl.error) {
      app.title('Error - Comparison')
      children.push(m('h2.comparison-header', 'Error during comparison'))
      children.push(m('p', ctrl.error))
    } else if (!ctrl.one.data || !ctrl.two.data) {
      children.push(m('p.text-center', 'Loading packages, and reticulating spines...'))
    } else {
      app.title([ctrl.one.data.name, 'vs', ctrl.two.data.name, '-', 'Comparison Results'].join(' '))
      children.push(app.components.comparison({
        packages: [
          ctrl.one,
          ctrl.two
        ]
      }))
    }

    return m('div.comparison', [
      app.components.header(),
      m('div.container', children)
    ])
  }
})

app.init(document.body)
Pod::Spec.new do |s|
  s.name             = 'PublicationCatalogReceive'
  s.version          = '1.0.0'
  s.summary          = 'Bounded private Publication Catalog receipt for OTR Mobile'
  s.license          = { :type => 'MIT' }
  s.author           = 'OTR Mobile'
  s.homepage         = 'https://github.com/xoery83/OTR-mobile'
  s.platforms        = { :ios => '16.4' }
  s.swift_version    = '5.9'
  s.source           = { :git => 'https://github.com/xoery83/OTR-mobile.git', :tag => 'publication-catalog-receive-1.0.0' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files     = '*.swift'
end
